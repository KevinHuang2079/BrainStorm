import '../styles/DeckItem.css';

const DeckItem = ({ deck, onClick }) => {
  return (
    <div className="deck-item" onClick={onClick}>
      <img 
        className="deck-item-image"
        src="https://imgproxy-434926184960.us-central1.run.app/ajc0YWF0UkxWQXhsTEFzSUc1S3BkUGxCZHM3WHJSY3czY1pTOGkwMXF2UT0/width:1200/height:1060/gravity:no/enlarge:1/format:webp/quality:80/aHR0cHM6Ly9hc3NldHMuZWNob210Zy5jb20vbWFnaWMvY2FyZHMvY3JvcHBlZC8yNDk1LmhxLmpwZw" 
        alt="Default Magic Card" 
      />
      <h3 className="deck-item-name">{deck.name}</h3>
      <p className="deck-item-price">${deck.priceValue?.toFixed(2) || '0.00'}</p>
      <p className="deck-item-format">{deck.format}</p>
    </div>
  );
};

export default DeckItem;