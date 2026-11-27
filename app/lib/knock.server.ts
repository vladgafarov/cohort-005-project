import { Knock } from "@knocklabs/node";
import type {
  PreferenceSet,
  PreferenceSetRequest,
} from "@knocklabs/node/resources/recipients/preferences.js";
import type { WorkflowTriggerParams } from "@knocklabs/node/resources/workflows.js";

// ─── Notifications (Knock) ───
// Every call to the notification provider — user identification, workflow
// triggers, preference-set reads, preference-set writes — passes through
// this module. Nothing outside it talks to Knock: route actions stay
// one-line dispatchers (payload builder, then one of these functions), the
// same seam the mailer's transport gives email.
//
// Identification is inline-only: Knock's user id is our user id stringified
// (the id string *is* the mapping — no mapping table, no sync regimen), and
// every trigger upserts recipient and actor identity inline. The one other
// identification site, the first settings-tab toggle, calls identifyUser
// directly before writing.
//
// Failure contract: a failed call is logged and swallowed — the Notification
// is lost, and the surrounding action still succeeds. No retry, no queue, no
// local shadow.

export type UserIdentity = {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export type WorkflowTrigger = {
  workflowKey: string;
  recipients: UserIdentity[];
  actor: UserIdentity;
  data: Record<string, unknown>;
};

// The workflow-preference value shape, settled against the installed SDK
// (@knocklabs/node 1.41.1): `PreferenceSetRequest["workflows"]` values are
// `boolean | PreferenceSetWorkflowCategorySettingObject`. The bare boolean is
// a valid value, and it is the whole truth for a single-Channel feed with no
// per-channel toggles or conditions to express — so Cadence writes and reads
// bare booleans only. (Knock's OpenAPI docs show the bare boolean, its client
// docs the object form; the SDK's union accepts both, and the boolean is the
// one we carry.)
export type WorkflowPreferenceValue = boolean;

const DEFAULT_PREFERENCE_SET_ID = "default";

export interface KnockTransport {
  identifyUser(
    userId: string,
    identity: { name: string; email: string; avatar: string | null }
  ): Promise<void>;
  triggerWorkflow(
    workflowKey: string,
    params: WorkflowTriggerParams
  ): Promise<void>;
  getPreferences(userId: string, setId: string): Promise<PreferenceSet>;
  setPreferences(
    userId: string,
    setId: string,
    request: PreferenceSetRequest
  ): Promise<PreferenceSet>;
}

export function knockTransport(apiKey: string): KnockTransport {
  const knock = new Knock({ apiKey });
  return {
    async identifyUser(userId, identity) {
      await knock.users.update(userId, {
        name: identity.name,
        email: identity.email,
        avatar: identity.avatar,
      });
    },
    async triggerWorkflow(workflowKey, params) {
      await knock.workflows.trigger(workflowKey, params);
    },
    getPreferences(userId, setId) {
      return knock.users.getPreferences(userId, setId);
    },
    setPreferences(userId, setId, request) {
      return knock.users.setPreferences(userId, setId, request);
    },
  };
}

function unconfiguredTransport(): KnockTransport {
  const unconfigured = async (): Promise<never> => {
    throw new Error("KNOCK_API_KEY is not set; notifications are not configured");
  };
  return {
    identifyUser: unconfigured,
    triggerWorkflow: unconfigured,
    getPreferences: unconfigured,
    setPreferences: unconfigured,
  };
}

function defaultTransport(): KnockTransport {
  const apiKey = process.env.KNOCK_API_KEY;
  return apiKey ? knockTransport(apiKey) : unconfiguredTransport();
}

function inlineIdentity(user: UserIdentity) {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    avatar: user.avatarUrl,
  };
}

export async function identifyUser(
  user: UserIdentity,
  transport: KnockTransport = defaultTransport()
): Promise<void> {
  try {
    await transport.identifyUser(String(user.id), {
      name: user.name,
      email: user.email,
      avatar: user.avatarUrl,
    });
  } catch (error) {
    console.error(`Knock identify failed for user ${user.id}`, error);
  }
}

export async function triggerWorkflow(
  trigger: WorkflowTrigger,
  transport: KnockTransport = defaultTransport()
): Promise<void> {
  try {
    await transport.triggerWorkflow(trigger.workflowKey, {
      recipients: trigger.recipients.map(inlineIdentity),
      actor: inlineIdentity(trigger.actor),
      data: trigger.data,
    });
  } catch (error) {
    console.error(
      `Knock trigger "${trigger.workflowKey}" failed; notification lost`,
      error
    );
  }
}

export async function getNotificationPreferences(
  userId: number,
  transport: KnockTransport = defaultTransport()
): Promise<PreferenceSet | null> {
  try {
    return await transport.getPreferences(
      String(userId),
      DEFAULT_PREFERENCE_SET_ID
    );
  } catch (error) {
    console.error(`Knock preference read failed for user ${userId}`, error);
    return null;
  }
}

export async function setWorkflowPreference(
  userId: number,
  workflowKey: string,
  value: WorkflowPreferenceValue,
  transport: KnockTransport = defaultTransport()
): Promise<PreferenceSet | null> {
  try {
    return await transport.setPreferences(
      String(userId),
      DEFAULT_PREFERENCE_SET_ID,
      {
        // A bare PUT is destructive by default; merging keeps every other
        // workflow preference the user has already set.
        __persistence_strategy__: "merge",
        workflows: { [workflowKey]: value },
      }
    );
  } catch (error) {
    console.error(`Knock preference write failed for user ${userId}`, error);
    return null;
  }
}
