// Espelha supabase/schema.sql. Atualize os dois juntos.

export type ClientStatus = "active" | "paused" | "archived";
export type SitePlatform = "api" | "wordpress" | "webhook";
export type ContentType = "article" | "howto" | "guide" | "list" | "comparison" | "news";
export type FaqItem = { question: string; answer: string };
export type SourceItem = { title: string; url: string; publisher?: string | null };
export type PostStatus = "draft" | "scheduled" | "published" | "archived";
export type PublicationStatus = "pending" | "published" | "failed" | "unpublished";
export type DeliveryChannel = "api" | "wordpress" | "webhook";
export type DeliveryEvent = "publish" | "update" | "unpublish" | "test";

/** Unidade além da matriz (a matriz é o endereço principal do cliente). */
export interface ClientUnit {
  id: string;
  /** Como a unidade é chamada: "Filial Brasília", "Loja Centro". */
  label: string;
  address: string | null;
  city: string;
  state: string | null;
  phone: string | null;
  /** Responsável pela unidade (representante, gerente). */
  manager: string | null;
  /** Nome do perfil no Google Maps, quando diferente do nome da empresa. */
  maps_name: string | null;
}

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
  /** Identidade visual das imagens geradas por IA. */
  image_style: string | null;
  image_mood: "auto" | "escuro" | "claro" | "colorido" | "monocromatico";
  tone_of_voice: string | null;
  audience: string | null;
  keywords: string[];
  notes: string | null;
  about: string | null;
  services: string[];
  service_area: string | null;
  address: string | null;
  opening_hours: string | null;
  social_links: string[];
  expert_name: string | null;
  expert_credentials: string | null;
  expert_bio: string | null;
  status: ClientStatus;
  /** Filiais e outras unidades (a matriz fica nos campos de endereço acima). */
  units: ClientUnit[];
  /** Vigência do contrato (controle de renovação). */
  contract_start: string | null;
  contract_end: string | null;
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
  indexnow_key: string;
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
  /** GEO: resposta direta de 40–60 palavras exibida no topo do artigo. */
  answer_summary: string | null;
  key_takeaways: string[];
  faq: FaqItem[];
  sources: SourceItem[];
  content_type: ContentType;
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
  override_answer_summary: string | null;
  override_faq: FaqItem[] | null;
  slug: string | null;
  external_id: string | null;
  external_url: string | null;
  published_at: string | null;
  last_error: string | null;
  /** Versão no ar neste site (formato público, ver `PostSnapshot` em src/lib/content.ts). */
  snapshot: unknown | null;
  snapshot_at: string | null;
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

// ============ Equipe (supabase/migrations/003_profiles.sql) ============
export type ProfileRole = "admin" | "editor" | "writer";
export type ProfileStatus = "pending" | "active" | "blocked";

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
  job_title: string | null;
  bio: string | null;
  role: ProfileRole;
  status: ProfileStatus;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}
