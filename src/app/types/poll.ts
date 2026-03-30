export interface Poll {
  id:                  string;
  question:            string;
  options:             string[];
  created_by:          string | null;
  created_by_username: string | null;
  closes_at:           string | null;
  closed:              boolean;
  created_at:          string;
  request_id:          string | null;
  request_problem:     string | null;
  quorum_pct:          number;
  pass_pct:            number;
  vote_counts:         number[];
  total_votes:         number;
  member_count:        number;
  my_vote:             number | null;
  /** null = quorum not met / still open; true = passed; false = failed */
  passed:              boolean | null;
}
