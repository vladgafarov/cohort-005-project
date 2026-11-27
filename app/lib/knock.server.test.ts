import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PreferenceSet,
  PreferenceSetRequest,
} from "@knocklabs/node/resources/recipients/preferences.js";
import type { WorkflowTriggerParams } from "@knocklabs/node/resources/workflows.js";
import type { KnockTransport, UserIdentity, WorkflowTrigger } from "./knock.server";
import {
  getNotificationPreferences,
  identifyUser,
  setWorkflowPreference,
  triggerWorkflow,
} from "./knock.server";

// A preference set as Knock might return it. Cadence writes bare boolean
// workflow preferences, so this is the shape the wrapper reads back.
const KNOWN_PREFERENCE_SET: PreferenceSet = {
  id: "default",
  workflows: {
    "new-lesson-available": true,
    "refund-request-raised": false,
  },
};

const INSTRUCTOR_IDA: UserIdentity = {
  id: 7,
  name: "Ida Instructor",
  email: "ida@example.com",
  avatarUrl: null,
};

const STUDENT_SAM: UserIdentity = {
  id: 42,
  name: "Sam Student",
  email: "sam@example.com",
  avatarUrl: "https://cdn.example.com/sam.png",
};

const STUDENT_LEE: UserIdentity = {
  id: 43,
  name: "Lee Learner",
  email: "lee@example.com",
  avatarUrl: null,
};

const NEW_LESSON_TRIGGER: WorkflowTrigger = {
  workflowKey: "new-lesson-available",
  recipients: [STUDENT_SAM, STUDENT_LEE],
  actor: INSTRUCTOR_IDA,
  data: { courseTitle: "Cadence Basics", lessonId: 512 },
};

function recordingTransport() {
  const identified: {
    userId: string;
    identity: { name: string; email: string; avatar: string | null };
  }[] = [];
  const triggered: { workflowKey: string; params: WorkflowTriggerParams }[] = [];
  const preferenceReads: { userId: string; setId: string }[] = [];
  const preferenceWrites: {
    userId: string;
    setId: string;
    request: PreferenceSetRequest;
  }[] = [];

  const transport: KnockTransport = {
    async identifyUser(userId, identity) {
      identified.push({ userId, identity });
    },
    async triggerWorkflow(workflowKey, params) {
      triggered.push({ workflowKey, params });
    },
    async getPreferences(userId, setId) {
      preferenceReads.push({ userId, setId });
      return KNOWN_PREFERENCE_SET;
    },
    async setPreferences(userId, setId, request) {
      preferenceWrites.push({ userId, setId, request });
      return KNOWN_PREFERENCE_SET;
    },
  };

  return { transport, identified, triggered, preferenceReads, preferenceWrites };
}

function throwingTransport(): KnockTransport {
  const fail = async (): Promise<never> => {
    throw new Error("Knock is unreachable");
  };
  return {
    identifyUser: fail,
    triggerWorkflow: fail,
    getPreferences: fail,
    setPreferences: fail,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("triggerWorkflow", () => {
  it("sends the workflow key, inline-identified recipients and actor, and the data, with our user id stringified", async () => {
    const { transport, triggered } = recordingTransport();

    await triggerWorkflow(NEW_LESSON_TRIGGER, transport);

    expect(triggered).toEqual([
      {
        workflowKey: "new-lesson-available",
        params: {
          recipients: [
            {
              id: "42",
              name: "Sam Student",
              email: "sam@example.com",
              avatar: "https://cdn.example.com/sam.png",
            },
            {
              id: "43",
              name: "Lee Learner",
              email: "lee@example.com",
              avatar: null,
            },
          ],
          actor: {
            id: "7",
            name: "Ida Instructor",
            email: "ida@example.com",
            avatar: null,
          },
          data: { courseTitle: "Cadence Basics", lessonId: 512 },
        },
      },
    ]);
  });

  it("loses the notification without breaking the calling action when the transport throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      triggerWorkflow(NEW_LESSON_TRIGGER, throwingTransport())
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("new-lesson-available"),
      expect.any(Error)
    );
  });
});

describe("identifyUser", () => {
  it("identifies the user by our id stringified with their name, email and avatar", async () => {
    const { transport, identified } = recordingTransport();

    await identifyUser(STUDENT_SAM, transport);

    expect(identified).toEqual([
      {
        userId: "42",
        identity: {
          name: "Sam Student",
          email: "sam@example.com",
          avatar: "https://cdn.example.com/sam.png",
        },
      },
    ]);
  });

  it("is swallowed when the transport throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(identifyUser(STUDENT_SAM, throwingTransport())).resolves
      .toBeUndefined();

    expect(consoleError).toHaveBeenCalledOnce();
  });
});

describe("getNotificationPreferences", () => {
  it("reads the user's default preference set", async () => {
    const { transport, preferenceReads } = recordingTransport();

    const preferences = await getNotificationPreferences(42, transport);

    expect(preferenceReads).toEqual([{ userId: "42", setId: "default" }]);
    expect(preferences).toBe(KNOWN_PREFERENCE_SET);
  });

  it("resolves null when the transport throws, keeping the calling action alive", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      getNotificationPreferences(42, throwingTransport())
    ).resolves.toBeNull();

    expect(consoleError).toHaveBeenCalledOnce();
  });
});

describe("setWorkflowPreference", () => {
  it("merge-writes the bare boolean workflow preference on the default set", async () => {
    const { transport, preferenceWrites } = recordingTransport();

    const written = await setWorkflowPreference(
      42,
      "new-lesson-available",
      false,
      transport
    );

    expect(preferenceWrites).toEqual([
      {
        userId: "42",
        setId: "default",
        request: {
          __persistence_strategy__: "merge",
          workflows: { "new-lesson-available": false },
        },
      },
    ]);
    expect(written).toBe(KNOWN_PREFERENCE_SET);
  });

  it("resolves null when the transport throws, keeping the calling action alive", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      setWorkflowPreference(42, "new-lesson-available", true, throwingTransport())
    ).resolves.toBeNull();

    expect(consoleError).toHaveBeenCalledOnce();
  });
});
