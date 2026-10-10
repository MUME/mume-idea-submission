// Shared types for the Worker and the form config.

export interface Env {
  DB: D1Database;
  CONFIG: KVNamespace;

  // vars
  PUBLIC_BASE_URL: string;

  // secrets
  DISCORD_APP_ID: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_GUILD_ID: string;
  FORUM_CHANNEL_ID: string;
  SUBMIT_CHANNEL_ID: string;
  EXPORT_CHANNEL_ID: string;
  // The private review forum ("submitted-ideas") where a copy is mirrored on Submitted.
  SUBMITTED_CHANNEL_ID: string;
  COUNCIL_ROLE_ID: string;
  SESSION_SIGNING_KEY: string;
  ADMIN_TOKEN: string;
}

export type Status = "in_proposal" | "final_draft" | "submitted" | "approved" | "resolved";

export type FieldType = "text" | "textarea" | "radio" | "checkbox";

export interface FieldOption {
  value: string;
  label: string;
  description?: string;
}

export interface Field {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  errorName?: string;
  options?: FieldOption[];
  guidance?: string[];
  guidanceLabel?: string;
  layout?: "cols";
  // Short name used for this field's row in the posted embed. Falls back to label.
  embedLabel?: string;
}

export interface Page {
  id: string;
  title: string;
  fields: Field[];
}

export interface EmbedConfig {
  titleField: string;
  bodyField: string;
  summaryFields: string[];
  // Long-form fields rendered full-width under the summary (e.g. outcome, extra).
  detailFields?: string[];
}

export interface FormConfig {
  version: number;
  title: string;
  subtitle: string;
  intro: string[];
  pages: Page[];
  embed: EmbedConfig;
}

export interface IdeaRow {
  id: number;
  guild_id: string;
  author_id: string;
  author_name: string;
  thread_id: string | null;
  message_id: string | null;
  // The mirrored copy in the private review forum, created on Submitted.
  review_thread_id: string | null;
  review_message_id: string | null;
  title: string;
  status: Status;
  schema_version: number;
  answers: string; // JSON string
  created_at: number;
  updated_at: number;
}

// Answers are keyed by field id. Scalar for text/textarea/radio, array for checkbox.
export type Answers = Record<string, string | string[]>;

// The verified identity carried by an Activity session token.
export interface Session {
  u: string; // discord user id
  n: string; // display name
  g: string; // guild id
  exp: number; // unix seconds
}
