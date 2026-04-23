-- Add notes column to file_attachments for text document content
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS notes TEXT;
