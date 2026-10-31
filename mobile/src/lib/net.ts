import { fetch } from "expo/fetch";

import type { Fetcher } from "./client.ts";

export const fetcher = fetch as unknown as Fetcher;
