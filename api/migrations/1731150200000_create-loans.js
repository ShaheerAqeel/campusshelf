/** Loans. A loan is active while returned_at IS NULL and overdue when due_at has passed. */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE loans (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id     INTEGER NOT NULL REFERENCES books(id),
      borrowed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      due_at      TIMESTAMPTZ NOT NULL,
      returned_at TIMESTAMPTZ,
      CONSTRAINT due_after_borrow CHECK (due_at > borrowed_at)
    );
    CREATE INDEX loans_active_user_idx ON loans (user_id) WHERE returned_at IS NULL;
    CREATE INDEX loans_active_due_idx  ON loans (due_at)  WHERE returned_at IS NULL;
    CREATE INDEX loans_book_idx        ON loans (book_id);
    -- A member cannot hold two active loans of the same title.
    CREATE UNIQUE INDEX loans_one_active_per_book ON loans (user_id, book_id) WHERE returned_at IS NULL;
  `);
};

export const down = (pgm) => {
  pgm.sql('DROP TABLE loans;');
};
