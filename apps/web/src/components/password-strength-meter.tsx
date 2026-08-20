import { useMemo } from "react";
import { zxcvbn } from "../lib/zxcvbn-init";

type StrengthColor = "red" | "yellow" | "green";

function colorForScore(score: number): StrengthColor {
	if (score <= 1) return "red";
	if (score === 2) return "yellow";
	return "green";
}

const BAR_CLASSES: Record<StrengthColor, string> = {
	red: "bg-destructive",
	yellow: "bg-warning",
	green: "bg-success",
};

type Props = {
	password: string;
};

export function PasswordStrengthMeter({ password }: Props) {
	const result = useMemo(() => {
		if (!password) {
			return { score: 0 as 0 | 1 | 2 | 3 | 4, feedback: { suggestions: [] as string[] } };
		}
		return zxcvbn(password);
	}, [password]);

	const score = result.score;
	const suggestion = score < 3 ? (result.feedback.suggestions[0] ?? "") : "";
	const color = colorForScore(score);

	return (
		<div className="mt-2 space-y-1">
			<div className="flex gap-1">
				{[0, 1, 2, 3].map((index) => {
					const filled = index < score;
					return (
						<div
							key={index}
							data-testid="strength-bar"
							data-filled={String(filled)}
							data-color={filled ? color : "none"}
							className={`h-1.5 flex-1 rounded-full transition-colors ${
								filled ? BAR_CLASSES[color] : "bg-muted"
							}`}
						/>
					);
				})}
			</div>
			{suggestion ? (
				<p data-testid="strength-suggestion" className="text-xs text-muted-foreground">
					{suggestion}
				</p>
			) : (
				<p data-testid="strength-suggestion" className="text-xs text-muted-foreground" />
			)}
		</div>
	);
}
