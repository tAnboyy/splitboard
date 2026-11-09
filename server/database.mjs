import { checkServerIdentity } from 'node:tls';
export function databaseOptions(env) {
  const options = { connectionString: env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000 };
  if (env.DATABASE_SSL_CA) {
    const url = new URL(env.DATABASE_URL);
    // URL SSL modes override pg's ssl object; keep the explicitly trusted CA.
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(key);
    options.connectionString = url.toString();
    options.ssl = { ca: env.DATABASE_SSL_CA, rejectUnauthorized: true };
    // Railway's authenticated TCP proxy forwards to the database's private TLS identity.
    if (env.DATABASE_TLS_SERVERNAME) options.ssl.checkServerIdentity = (_, cert) => checkServerIdentity(env.DATABASE_TLS_SERVERNAME, cert);
  }
  return options;
}
