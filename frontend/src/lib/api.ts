/**
 * lib/api.ts — legacy re-export of the shared axios instance.
 *
 * The `api` instance from api/client is re-exported as the default for the
 * handful of files in api/* and hooks/* that still import it from here
 * (auth.ts, collections.ts, collectionsApi.ts, company-collections.ts,
 * quotes.ts). New code should import directly from `api/client`.
 *
 * (The former workflowApi / memoryApi helpers + their types were removed —
 * they powered the unrouted CreateWorkflow scaffolding, which has been deleted.
 * No backend /workflows or /memory routes exist.)
 */
import { api } from '../api/client';

export default api;
