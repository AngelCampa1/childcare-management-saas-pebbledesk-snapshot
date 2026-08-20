type StepHref = "" | "/classrooms" | "/children/enroll" | "/guardians" | "/billing" | "/attendance";

export type SetupStep = {
	index: number;
	label: string;
	ctaLabel: string;
	href: StepHref;
	done: boolean;
};

export function computeSetupProgress(opts: {
	hasClassrooms: boolean;
	hasChildren: boolean;
	hasGuardians: boolean;
	hasBilling: boolean;
}): { steps: SetupStep[]; currentStep: SetupStep | null; allDone: boolean } {
	const steps: SetupStep[] = [
		{ index: 1, label: "Create your account", ctaLabel: "", href: "", done: true },
		{
			index: 2,
			label: "Add a classroom",
			ctaLabel: "Create classroom",
			href: "/classrooms",
			done: opts.hasClassrooms,
		},
		{
			index: 3,
			label: "Enroll children",
			ctaLabel: "Enroll a child",
			href: "/children/enroll",
			done: opts.hasChildren,
		},
		{
			index: 4,
			label: "Add guardians",
			ctaLabel: "Add a guardian",
			href: "/guardians",
			done: opts.hasGuardians,
		},
		{
			index: 5,
			label: "Set up billing",
			ctaLabel: "Set up billing",
			href: "/billing",
			done: opts.hasBilling,
		},
	];
	const currentStep = steps.find((s) => !s.done) ?? null;
	return { steps, currentStep, allDone: currentStep === null };
}
