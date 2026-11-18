-- C.2: Full-Text Search GIN indexes ('simple' config — Persian, no stemming)

CREATE INDEX IF NOT EXISTS idx_characters_fts ON characters USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(background,'') || ' ' || coalesce(occupation,'')));

CREATE INDEX IF NOT EXISTS idx_opening_lines_fts ON opening_lines USING GIN (to_tsvector('simple', text));

CREATE INDEX IF NOT EXISTS idx_style_paragraphs_fts ON style_paragraphs USING GIN (to_tsvector('simple', coalesce(original_text,'') || ' ' || coalesce(author,'')));

CREATE INDEX IF NOT EXISTS idx_news_items_fts ON news_items USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'')));

CREATE INDEX IF NOT EXISTS idx_reference_stories_fts ON reference_stories USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(text,'')));
