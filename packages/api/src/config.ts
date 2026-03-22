export const config = {
  databaseUrl:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/newsletter",
  port: Number(process.env.PORT ?? "3000"),
};
