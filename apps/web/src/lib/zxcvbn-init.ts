import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import { adjacencyGraphs, dictionary } from "@zxcvbn-ts/language-common";

zxcvbnOptions.setOptions({ graphs: adjacencyGraphs, dictionary });

export { zxcvbn };
