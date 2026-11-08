import { ProviderState } from "../crypto/limiter.js";

const RAW_SOURCES = [
  { id: "coindesk", name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { id: "cointelegraph", name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { id: "decrypt", name: "Decrypt", url: "https://decrypt.co/feed" },
  { id: "bitcoinmagazine", name: "Bitcoin Magazine", url: "https://bitcoinmagazine.com/feed" },
  { id: "beincrypto", name: "BeInCrypto", url: "https://beincrypto.com/feed/" },
  { id: "newsbtc", name: "NewsBTC", url: "https://www.newsbtc.com/feed/" },
  { id: "cryptoslate", name: "CryptoSlate", url: "https://cryptoslate.com/feed/" },
];

export const NEWS_SOURCES = RAW_SOURCES.map((source, index) => ({
  ...source,
  priority: index + 1,
  state: new ProviderState({
    id: source.id,
    name: source.name,
    priority: index + 1,
    maxPerWindow: 10,
    windowMs: 60_000,
  }),
}));
