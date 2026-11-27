import { data } from "react-router";
import { Link } from "react-router";
import type { Route } from "./+types/notifications";
import { getCurrentUserId } from "~/lib/session";
import { NotificationsFeed } from "~/components/notifications/notifications-feed";

export function meta() {
  return [
    { title: "Notifications — Cadence" },
    {
      name: "description",
      content: "The Events that happened without you, in one feed",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to see notifications.", {
      status: 401,
    });
  }

  return {};
}

export default function Notifications() {
  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Notifications</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Notifications</h1>
        <p className="mt-1 text-muted-foreground">
          Everything that happened without you, newest first
        </p>
      </div>

      <NotificationsFeed />
    </div>
  );
}
