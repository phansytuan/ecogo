// Injection token for the pg Pool. Kept in its own file so both
// database.module.ts and database.service.ts can import it without creating a
// circular import (the module imports the service and vice-versa).
export const PG_POOL = 'PG_POOL';
