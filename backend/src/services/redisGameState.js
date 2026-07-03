const { createClient } = require('redis');

const client = createClient({ url: process.env.REDIS_URL });

client.on('error', err => console.error('[REDIS]', err));

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
    if (!raw || Object.keys(raw).length === 0) return null;

    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        out[k] = JSON.parse(v);
    }
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

    deleteGame
};