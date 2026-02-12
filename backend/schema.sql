create extension if not exists vector;

create table if not exists settings (
  key text primary key,
  value text not null
);

create table if not exists documents (
  id uuid primary key,
  filename text not null,
  mime_type text not null,
  size integer not null,
  storage_path text not null,
  created_at timestamptz default now()
);

create table if not exists document_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  external_id text,
  source text not null,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null,
  content text not null,
  source text not null,
  created_at timestamptz default now()
);
