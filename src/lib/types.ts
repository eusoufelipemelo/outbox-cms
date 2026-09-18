// Espelha supabase/schema.sql. Atualize os dois juntos.

export type ClientStatus = "active" | "paused" | "archived";
export type SitePlatform = "api" | "wordpress" | "webhook";
export type PostStatus = "draft" | "scheduled" | "published" | "archived";
export type PublicationStatus = "pending" | "published" | "failed" | "unpublished";
export type DeliveryChannel = "api" | "wordpress" | "webhook";
export type DeliveryEvent = "publish" | "update" | "unpublish" | "test";

export interface Client {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  segment: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  brand_color: string | null;
  tone_of_voice: string | null;
  audience: string | null;
  keywords: string[];
  notes: string | null;
  status: ClientStatus;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: string;
  client_id: string;
  name: string;
  url: string;
  blog_path: string;
  platform: SitePlatform;
  public_key: string;
  webhook_url: string | null;
  webhook_secret: string;
  wp_url: string | null;
  wp_username: string | null;
  wp_app_password: string | null;
  wp_default_status: "publish" | "draft";
  default_author: string | null;
  default_category: string | null;
  status: "active" | "paused";
  last_check_at: string | null;
  last_check_ok: boolean | null;
  last_check_message: string | null;
  created_at: string;
  updated_at: string;
}

export type SiteWithClient = Site & { client: Pick<Client, "id" | "name" | "brand_color" | "city" | "state"> };

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content_html: string;
  content_json: unknown | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  category: string | null;
  tags: string[];
  author_name: string | null;
  seo_title: string | null;
  seo_description: string | null;
  focus_keyword: string | null;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  word_count: number;
  reading_minutes: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostSite {
  id: string;
  post_id: string;
  site_id: string;
  status: PublicationStatus;
  is_canonical: boolean;
  override_title: string | null;
  override_excerpt: string | null;
  override_content_html: string | null;
  override_seo_title: string | null;
  override_seo_description: string | null;
  slug: string | null;
  external_id: string | null;
  external_url: string | null;
  published_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Delivery {
  id: string;
  post_site_id: string | null;
  post_id: string | null;
  site_id: string | null;
  channel: DeliveryChannel;
  event: DeliveryEvent;
  ok: boolean;
  status_code: number | null;
  message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface PostRevision {
  id: string;
  post_id: string;
  title: string | null;
  content_html: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Media {
  id: string;
  path: string;
  url: string;
  alt: string | null;
  mime: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  client_id: string | null;
  created_by: string | null;
  created_at: string;
}

/** Retorno padrão das server actions usadas em formulários. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
