import type { AuthorDocDiff } from "./diff";
import type { Document } from "./storydoc";

export interface AuthorDocSynchronizer {
    synchronize(before: Document, change: AuthorDocDiff): AuthorDocDiff;
}
