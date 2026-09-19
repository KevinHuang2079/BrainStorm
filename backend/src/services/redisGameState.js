//src/services/redisGameState.js

const { createClient } = require('redis');

const client = createClient({ url: process.env.REDIS_URL });

client.on('error', err => console.error('[REDIS]', err));

const ACTIVITY_WARN_TTL  = Math.floor(60 * 1);   // 1 min — matches INACTIVITY_WARNING_MS
const ACTIVITY_CLOSE_TTL = Math.floor(60 * 4);   // 4 min — remaining time to close

const activityWarnKey  = gameId => `game:${gameId}:activityWarn`;
const activityCloseKey = gameId => `game:${gameId}:activityClose`;
const lockKey = (gameId, stage) => `game:${gameId}:lock:${stage}`;

// Called on every player action. Arms the warning TTL and clears any
// close-stage key/lock left over from a previous cycle.
async function resetActivity(gameId) {
    const multi = client.multi();
    multi.set(activityWarnKey(gameId), '1', { EX: ACTIVITY_WARN_TTL });
    multi.del(activityCloseKey(gameId));
    multi.del(lockKey(gameId, 'warn'));
    multi.del(lockKey(gameId, 'close'));
    await multi.exec();
}

// Called once the warn key expires and we've won the lock for that stage.
async function armCloseTimer(gameId) {
    await client.set(activityCloseKey(gameId), '1', { EX: ACTIVITY_CLOSE_TTL });
}

// Distributed lock: only the first instance to call this for a given
// (gameId, stage) gets `true`. Short TTL so a crashed instance doesn't
// permanently wedge the lock.
async function acquireLock(gameId, stage, ttlSeconds = 10) {
    const res = await client.set(lockKey(gameId, stage), '1', { NX: true, EX: ttlSeconds });
    return res === 'OK';
}

async function clearActivityKeys(gameId) {
    await client.del(
        activityWarnKey(gameId),
        activityCloseKey(gameId),
        lockKey(gameId, 'warn'),
        lockKey(gameId, 'close')
    );
}


function createDuplicateClient() {
    // .duplicate() reuses the same connection options (url, TLS, etc.)
    // but gives you an independent connection — required because a client
    // in subscriber mode can't run other commands.
    const dup = client.duplicate();
    dup.on('error', err => console.error('[REDIS DUP]', err));
    return dup;
}

async function initRedis() {
    if (!client.isOpen) {
        await client.connect();
        console.log('[REDIS] connected');
    }
}

// TTLs
const STATE_TTL     = 60 * 60 * 24;   // 24 h — safety net; inactivity timer expires first
const HYDRATED_TTL  = 60 * 60;        // 1 h  — hydrated card cache per game
const PLAYERS_TTL   = STATE_TTL;

// ─── key helpers ────────────────────────────────────────────────────────────
const stateKey    = gameId => `game:${gameId}:state`;       // Hash  playerId → JSON
const hydratedKey = gameId => `game:${gameId}:hydrated`;    // Hash  playerId → JSON
const playersKey  = gameId => `game:${gameId}:players`;     // Set   of userId strings
const chatKey     = gameId => `game:${gameId}:chat`;        // String (JSON array)

// ─── Mongo flush dirty-set ───────────────────────────────────────────────────
// ZSET: member = gameId, score = timestamp the game FIRST went dirty since its
// last flush. NX on zAdd means repeated writes to an already-dirty game don't
// push the score forward — this bounds max staleness instead of debouncing it.
// Replaces the old in-process mongoFlushTimers Map so any instance's sweeper
// can see and act on it.
const MONGO_DIRTY_KEY = 'mongoFlush:dirty';

async function markGameDirty(gameId) {
    const added = await client.zAdd(MONGO_DIRTY_KEY, { score: Date.now(), value: gameId.toString() }, { NX: true });
    const score = await client.zScore(MONGO_DIRTY_KEY, gameId.toString());
    console.log(`[REDIS DIRTY] markGameDirty game=${gameId} newlyMarked=${added === 1} dirtySince=${score ? new Date(Number(score)).toISOString() : 'n/a'}`);
    return added;
}

async function clearGameDirty(gameId) {
    const removed = await client.zRem(MONGO_DIRTY_KEY, gameId.toString());
    console.log(`[REDIS DIRTY] clearGameDirty game=${gameId} wasPresent=${removed === 1}`);
    return removed;
}

async function getStaleDirtyGames(olderThanMs) {
    const cutoff = Date.now() - olderThanMs;
    const stale = await client.zRangeByScore(MONGO_DIRTY_KEY, 0, cutoff);
    const all = await client.zRangeWithScores(MONGO_DIRTY_KEY, 0, -1);
    console.log(`[REDIS DIRTY] sweep cutoff=${new Date(cutoff).toISOString()} stale=[${stale.join(',')}] allDirty=${JSON.stringify(all.map(m => ({ game: m.value, since: new Date(m.score).toISOString() })))}`);
    return stale;
}

// ─── stripped (storage) state ───────────────────────────────────────────────

async function saveStrippedPlayerState(gameId, playerId, strippedState, timestamp) {
    const payload = JSON.stringify({
        ...strippedState,
        lastUpdated: new Date(timestamp).toISOString()
    });

    const multi = client.multi();
    multi.hSet(stateKey(gameId), playerId, payload);
    multi.expire(stateKey(gameId), STATE_TTL);
    await multi.exec();
}

async function getStrippedGameState(gameId) {
    const raw = await client.hGetAll(stateKey(gameId));
    if (!raw || Object.keys(raw).length === 0) {
        console.log(`[REDIS STATE] getStrippedGameState game=${gameId} -> EMPTY/MISSING`);
        return null;
    }

    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        out[k] = JSON.parse(v);
    }
    console.log(`[REDIS STATE] getStrippedGameState game=${gameId} players=[${Object.keys(out).join(',')}]`);
    return out;
}

async function deletePlayerFromState(gameId, playerId) {
    await client.hDel(stateKey(gameId), playerId);
}

// ─── hydrated state cache ───────────────────────────────────────────────────

async function saveHydratedPlayerState(gameId, playerId, hydratedState) {
    const multi = client.multi();
    multi.hSet(hydratedKey(gameId), playerId, JSON.stringify(hydratedState));
    multi.expire(hydratedKey(gameId), HYDRATED_TTL);
    await multi.exec();
}

async function getHydratedGameState(gameId) {
    const raw = await client.hGetAll(hydratedKey(gameId));
    if (!raw || Object.keys(raw).length === 0) return null;

    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        out[k] = JSON.parse(v);
    }
    return out;
}

async function deleteHydratedPlayerState(gameId, playerId) {
    await client.hDel(hydratedKey(gameId), playerId);
}

// ─── player membership set ──────────────────────────────────────────────────

async function addPlayerToGame(gameId, playerId) {
    await client.sAdd(playersKey(gameId), playerId.toString());
    await client.expire(playersKey(gameId), PLAYERS_TTL);
}

async function removePlayerFromGame(gameId, playerId) {
    await client.sRem(playersKey(gameId), playerId.toString());
}

async function isPlayerInGame(gameId, userId) {
    return await client.sIsMember(playersKey(gameId), userId.toString());
}

// ─── chat log ───────────────────────────────────────────────────────────────

async function saveChatLog(gameId, chatLog) {
    await client.set(chatKey(gameId), JSON.stringify(chatLog), { EX: STATE_TTL });
}

async function getChatLog(gameId) {
    const raw = await client.get(chatKey(gameId));
    return raw ? JSON.parse(raw) : null;
}

// ─── full game teardown ─────────────────────────────────────────────────────

async function deleteGame(gameId) {
    await client.del(
        stateKey(gameId),
        hydratedKey(gameId),
        playersKey(gameId),
        chatKey(gameId)
    );
    await client.zRem(MONGO_DIRTY_KEY, gameId.toString());
}

module.exports = {
    client,
    initRedis,
    createDuplicateClient,

    saveStrippedPlayerState,
    getStrippedGameState,
    deletePlayerFromState,

    saveHydratedPlayerState,
    getHydratedGameState,
    deleteHydratedPlayerState,

    addPlayerToGame,
    removePlayerFromGame,
    isPlayerInGame,

    saveChatLog,
    getChatLog,

    resetActivity,
    armCloseTimer,
    acquireLock,
    clearActivityKeys,

    markGameDirty,
    clearGameDirty,
    getStaleDirtyGames,

    deleteGame
};