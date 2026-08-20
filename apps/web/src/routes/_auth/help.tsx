import { Input } from "@pebbledesk/ui/components/input";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { GuideCard } from "../../components/guidance";
import { useAuthSession } from "../../hooks/use-auth-session";
import {
	getGuideById,
	getGuidesForRole,
	searchHelp,
	stepVisibleToRole,
} from "../../lib/guidance-content";

export const Route = createFileRoute("/_auth/help")({
	component: HelpPage,
});

export function HelpPage() {
	const { data: session, isLoading } = useAuthSession();
	const [query, setQuery] = useState("");
	const role = session?.membership.role ?? "staff";
	const guides = getGuidesForRole(role);
	const topics = useMemo(() => searchHelp(role, query), [role, query]);

	if (isLoading) {
		return <HelpSkeleton />;
	}

	return (
		<div className="space-y-6">
			<section className="rounded-xl border border-border bg-background p-6 shadow-sm">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
					<div className="max-w-2xl">
						<div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
							<BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
							Help center
						</div>
						<h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
							Step-by-step help for PebbleDesk
						</h1>
						<p className="mt-2 text-sm leading-6 text-muted-foreground">
							Find the next step, learn the daily routine, or look up a plain-language answer when
							something feels unfamiliar.
						</p>
					</div>
					<div className="relative w-full max-w-md">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search PDF, attendance, ratio..."
							className="h-11 pl-9"
							aria-label="Search help"
						/>
					</div>
				</div>
			</section>

			<section className="space-y-3">
				<div>
					<h2 className="text-lg font-semibold text-foreground">Start here</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						These guides match what your role can actually open.
					</p>
				</div>
				<div className="grid gap-4 xl:grid-cols-2">
					{guides.map((guide) => (
						<GuideCard key={guide.id} guide={guide} role={role} />
					))}
				</div>
			</section>

			<section className="space-y-3">
				<div>
					<h2 className="text-lg font-semibold text-foreground">Quick answers</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Short answers for common questions. Pick one, then follow the matching guide.
					</p>
				</div>
				{topics.length > 0 ? (
					<div className="grid gap-3 lg:grid-cols-2">
						{topics.map((topic) => {
							const guide = topic.guideId ? getGuideById(topic.guideId) : undefined;
							const firstVisibleStep = guide?.steps.find((step) => stepVisibleToRole(step, role));
							const href = topic.href ?? firstVisibleStep?.href ?? "/help";

							return (
								<article
									key={topic.id}
									className="rounded-lg border border-border bg-background p-4 shadow-sm"
								>
									<h3 className="text-sm font-semibold text-foreground">{topic.title}</h3>
									<p className="mt-1 text-sm leading-6 text-muted-foreground">
										{topic.description}
									</p>
									<Link
										to={href}
										className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
									>
										Open next step
									</Link>
								</article>
							);
						})}
					</div>
				) : (
					<div className="rounded-lg border border-border bg-muted/40 p-6 text-center">
						<p className="text-sm font-medium text-foreground">No help topics found</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Try a simpler word like PDF, attendance, ratio, billing, or import.
						</p>
					</div>
				)}
			</section>
		</div>
	);
}

function HelpSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-44 rounded-xl" />
			<div className="grid gap-4 xl:grid-cols-2">
				<Skeleton className="h-72 rounded-xl" />
				<Skeleton className="h-72 rounded-xl" />
			</div>
		</div>
	);
}
