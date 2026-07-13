-- One rating per participant per booking. Prevents a passenger (or driver) from
-- rating the same trip repeatedly and skewing the counterpart's average.
DELETE FROM ratings a USING ratings b
  WHERE a.ctid < b.ctid
    AND a.booking_id = b.booking_id
    AND a.rater_id = b.rater_id;
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_booking_rater_uniq;
ALTER TABLE ratings ADD CONSTRAINT ratings_booking_rater_uniq UNIQUE (booking_id, rater_id);
