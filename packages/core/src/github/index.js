"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
// Re-export interface and stub (safe for unit tests)
__exportStar(require("./github-client"), exports);
__exportStar(require("./patch-applicator"), exports);
__exportStar(require("./webhook"), exports);
__exportStar(require("./webhook-service"), exports);
// Note: octokit-client is not re-exported here because it uses ESM imports
// that don't work well with Jest's CommonJS transform.
// Import directly from './github/octokit-client' when needed in production.
//# sourceMappingURL=index.js.map