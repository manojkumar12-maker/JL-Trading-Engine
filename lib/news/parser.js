import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  cdataPropName: "__cdata",
});

function text(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") {
    if ("#text" in value) return String(value["#text"]);
    if ("__cdata" in value) return String(value.__cdata);
    if ("@_href" in value) return String(value["@_href"]);
  }
  return "";
}

function stripHtml(value) {
  return text(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstLink(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const link = firstLink(item);
      if (link) return link;
    }
    return "";
  }
  if (typeof value === "object") {
    if (value["@_href"]) return String(value["@_href"]).trim();
    if (value["#text"]) return String(value["#text"]).trim();
  }
  return "";
}

function parseDate(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function parseFeed(xml) {
  const doc = parser.parse(xml);
  const items = [];

  const rss = doc.rss || doc["rdf:RDF"] || doc.RDF;
  const channel = rss?.channel;

  if (channel?.item) {
    const list = Array.isArray(channel.item) ? channel.item : [channel.item];
    for (const it of list) {
      items.push({
        title: stripHtml(it.title),
        link: firstLink(it.link) || firstLink(it.guid),
        summary: stripHtml(it.description ?? it["content:encoded"]),
        publishedAt: parseDate(it.pubDate ?? it["dc:date"] ?? it.published),
      });
    }
    return items;
  }

  if (doc.feed?.entry) {
    const list = Array.isArray(doc.feed.entry) ? doc.feed.entry : [doc.feed.entry];
    for (const it of list) {
      items.push({
        title: stripHtml(it.title),
        link: firstLink(it.link) || firstLink(it.id),
        summary: stripHtml(it.summary ?? it.content),
        publishedAt: parseDate(it.updated ?? it.published),
      });
    }
  }

  return items;
}
