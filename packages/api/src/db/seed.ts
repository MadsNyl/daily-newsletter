import { db } from "./index.js";
import { article, newsletterEdition, editionArticle } from "./schema.js";

async function seed() {
  console.log("Seeding database...");

  const [a1, a2] = await db
    .insert(article)
    .values([
      {
        title: "Norge setter ny rekord i eksport av sjømat",
        summary:
          "Norsk sjømatnæring har satt ny eksportrekord med en total verdi på over 170 milliarder kroner. Laksen står for den største andelen av eksporten.",
        sourceUrl: "https://example.com/sjomat-rekord",
        sourceName: "NRK",
        status: "SUMMARIZED",
        publishedAt: new Date("2025-03-15T08:00:00Z"),
      },
      {
        title: "Elbilsalget fortsetter å vokse i Norge",
        summary:
          "Nye tall viser at elbiler nå utgjør over 90 prosent av alle nye bilsalg i Norge, noe som befester landets posisjon som verdensledende.",
        sourceUrl: "https://example.com/elbil-salg",
        sourceName: "VG",
        status: "SUMMARIZED",
        publishedAt: new Date("2025-03-15T10:30:00Z"),
      },
      {
        title: "Ny studie avdekker klimaendringer i Arktis",
        sourceUrl: "https://example.com/arktis-klima",
        sourceName: "Dagbladet",
        status: "PENDING",
        publishedAt: new Date("2025-03-15T12:00:00Z"),
      },
    ])
    .returning();

  const [edition] = await db
    .insert(newsletterEdition)
    .values({
      date: new Date("2025-03-15"),
      status: "PUBLISHED",
    })
    .returning();

  await db.insert(editionArticle).values([
    { editionId: edition!.id, articleId: a1!.id, order: 1 },
    { editionId: edition!.id, articleId: a2!.id, order: 2 },
  ]);

  console.log("Seed complete: 3 articles, 1 edition");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
