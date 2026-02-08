/**
 * Role-Based Prompts
 *
 * System prompts for each agent role with versioning.
 */
import type { AgentRole, RoleConfig } from './types';
export interface PromptVersion {
    version: string;
    date: string;
    changes: string;
}
export interface VersionedPrompt {
    role: AgentRole;
    currentVersion: string;
    history: PromptVersion[];
    getPrompt(version?: string): string;
}
/**
 * Get the system prompt for a role and version.
 */
export declare function getPrompt(role: AgentRole, version?: string): string;
/**
 * Get current prompt version for a role.
 */
export declare function getCurrentVersion(role: AgentRole): string;
/**
 * Get all available versions for a role.
 */
export declare function getAvailableVersions(role: AgentRole): string[];
/**
 * Get the default role configuration.
 */
export declare function getRoleConfig(role: AgentRole): RoleConfig;
/**
 * Register a new prompt version.
 */
export declare function registerPromptVersion(role: AgentRole, version: string, prompt: string): void;
/**
 * Set the current version for a role.
 */
export declare function setCurrentVersion(role: AgentRole, version: string): void;
