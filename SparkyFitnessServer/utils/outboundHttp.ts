import net from 'net';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { log } from '../config/logging.js';
import { describeError } from './errors.js';

/**
 * Node's Happy Eyeballs implementation (`autoSelectFamily`, on by default since
 * Node 20) gives the first address family only 250ms to establish a connection
 * before racing the next one. That budget is fine on a LAN but too small for a
 * TLS-fronted provider reached over a Docker bridge network where IPv6 resolves
 * but is slow or blackholed: every attempt is cut short, and the request
 * rejects with an `AggregateError` whose `message` is the empty string.
 *
 * The user-visible symptom (issue #2285) is a Withings OAuth token exchange
 * that hangs for minutes and then logs a completely blank error. It looks
 * provider-specific only because it is dictated by DNS: Withings, Fitbit and
 * Strava publish AAAA records and are exposed, while IPv4-only providers such
 * as Oura and Hevy are not. It is not Withings-specific, so the fix is global.
 *
 * This is the in-process equivalent of running Node with
 * `--network-family-autoselection-attempt-timeout`, so self-hosters do not have
 * to discover and set `NODE_OPTIONS` themselves.
 */
const CONNECT_ATTEMPT_TIMEOUT_MS = 2000;

/**
 * axios ships with no default timeout, so a blackholed connection sat open
 * until the operating system gave up -- the several-minute hang in #2285.
 * Callers that legitimately need longer (the Garmin microservice, dataset
 * downloads) set their own timeout, which still wins over this default.
 */
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Fills in the message of a rejected request that carries none, so the
 * `${error.message}` log lines spread across the integration services stay
 * diagnosable. Only blank messages are rewritten: an error that already
 * describes itself ("Request failed with status code 401") is left untouched
 * so existing log and assertion text does not shift.
 *
 * `axios.create()` instances do not inherit interceptors from the default
 * instance, so any module holding its own instance must call this itself.
 */
function attachOutboundErrorDetail(instance: AxiosInstance): void {
  instance.interceptors.response.use(undefined, (error: unknown) => {
    if (
      error instanceof Error &&
      (typeof error.message !== 'string' || error.message.trim() === '')
    ) {
      error.message = describeError(error);
    }
    return Promise.reject(error);
  });
}

/**
 * Applies the process-wide outbound HTTP defaults. Must run after the
 * environment is loaded and before any outbound request is made.
 */
function configureOutboundHttp(): void {
  // Applies to every consumer of net.connect that does not override it --
  // axios through the core http agents, and native fetch through undici.
  net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS);
  axios.defaults.timeout = REQUEST_TIMEOUT_MS;

  attachOutboundErrorDetail(axios);

  log(
    'info',
    `Outbound HTTP defaults: ${REQUEST_TIMEOUT_MS}ms request timeout, ${CONNECT_ATTEMPT_TIMEOUT_MS}ms per address-family connect attempt.`
  );
}

export { attachOutboundErrorDetail, configureOutboundHttp };
