import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import tailwindConfig from "./tailwind.config";

const twMergeCustom = extendTailwindMerge({
    extend: {
        theme: {
            "font-weight": ["default", "bold", "bolder", "boldest"],
            leading: [
                "none",
                "smallest",
                "smaller",
                "small",
                "default",
                "large",
                "larger",
                "largest",
            ],
            font: ["heading", "body", "code"],
            radius: ["full", "default", "narrow"],
            text: [
                "smallest",
                "small",
                "default",
                "large",
                "larger",
                "largest",
                "giant",
                "enormous",
            ],
            shadow: ["overlay"],
            tracking: ["default", "tight", "tighter", "tightest"],
            spacing: [
                "default",
                "narrower",
                "narrow",
                "wide",
                "wider",
                "widest",
            ],
        },
        classGroups: {
            "min-h": Object.keys(tailwindConfig.theme.extend.minHeight).map(
                (key) => `min-h-${key}`,
            ),
            h: Object.keys(tailwindConfig.theme.extend.height).map(
                (key) => `h-${key}`,
            ),
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMergeCustom(clsx(inputs));
}
