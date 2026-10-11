// Compatibility entry point: all financial integration tests run in a temporary
// local database. Never create fixture users or orders in DATABASE_URL from .env.
import "./verify-referrals-isolated";
