//! dashboard-core — a tiny, dependency-free CSV + aggregation engine that turns a table into chart
//! series (labels + values). Pure Rust, no IO: the CSV comes in, the aggregation happens in memory,
//! and a small series goes out — so it compiles to `wasm32` and runs entirely in the browser. The
//! data never leaves the machine; the charts are drawn from numbers computed on-device.

use std::collections::BTreeMap;

/// A column is either numeric (usable as a measure) or text. A column is `Number` only if every
/// non-empty value parses as `f64`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColKind {
    Number,
    Text,
}

/// How to combine a group's measure values.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Agg {
    Count,
    Sum,
    Avg,
    Min,
    Max,
}

impl Agg {
    pub fn parse(s: &str) -> Agg {
        match s {
            "sum" => Agg::Sum,
            "avg" => Agg::Avg,
            "min" => Agg::Min,
            "max" => Agg::Max,
            _ => Agg::Count,
        }
    }
}

/// Chart-ready output: aligned `labels` (group keys) and `values`, sorted by value descending.
#[derive(Debug, PartialEq)]
pub struct Series {
    pub labels: Vec<String>,
    pub values: Vec<f64>,
}

/// A raw row-stored table (cells kept as strings; numbers are parsed on demand during aggregation).
#[derive(Debug, PartialEq)]
pub struct Table {
    pub headers: Vec<String>,
    pub kinds: Vec<ColKind>,
    rows: Vec<Vec<String>>,
}

impl Table {
    pub fn ncols(&self) -> usize {
        self.headers.len()
    }
    pub fn nrows(&self) -> usize {
        self.rows.len()
    }

    /// Indices of the numeric columns (candidate measures).
    pub fn numeric_cols(&self) -> Vec<usize> {
        (0..self.ncols()).filter(|&c| self.kinds[c] == ColKind::Number).collect()
    }

    pub fn from_csv(input: &str) -> Table {
        let mut records = parse_csv(input).into_iter();
        let headers = records.next().unwrap_or_default();
        let width = headers.len();
        let rows: Vec<Vec<String>> = records
            .map(|mut r| {
                r.truncate(width);
                while r.len() < width {
                    r.push(String::new());
                }
                r
            })
            .collect();
        let kinds = (0..width)
            .map(|c| {
                let mut any = false;
                let all_num = rows.iter().all(|r| {
                    let v = r[c].as_str();
                    if v.is_empty() {
                        return true;
                    }
                    any = true;
                    v.parse::<f64>().is_ok()
                });
                if any && all_num {
                    ColKind::Number
                } else {
                    ColKind::Text
                }
            })
            .collect();
        Table { headers, kinds, rows }
    }

    /// Group rows by the `category` column and combine the `measure` column with `agg`. For `Count`,
    /// `measure` may be `None`. Non-numeric/empty measure cells are skipped. Empty groups yield 0.
    /// The result is sorted by value descending (so a bar chart reads top-down).
    pub fn aggregate(&self, category: usize, measure: Option<usize>, agg: Agg) -> Series {
        let mut groups: BTreeMap<String, Vec<f64>> = BTreeMap::new();
        let mut counts: BTreeMap<String, f64> = BTreeMap::new();

        for row in &self.rows {
            let key = row.get(category).cloned().unwrap_or_default();
            *counts.entry(key.clone()).or_insert(0.0) += 1.0;
            if agg != Agg::Count {
                if let Some(m) = measure {
                    if let Some(v) = row.get(m).and_then(|s| s.parse::<f64>().ok()) {
                        groups.entry(key).or_default().push(v);
                    } else {
                        groups.entry(key).or_default(); // keep the group even if this cell is non-numeric
                    }
                }
            }
        }

        let mut pairs: Vec<(String, f64)> = match agg {
            Agg::Count => counts.into_iter().collect(),
            _ => counts
                .keys()
                .map(|k| {
                    let vals = groups.get(k).map(Vec::as_slice).unwrap_or(&[]);
                    (k.clone(), combine(vals, agg))
                })
                .collect(),
        };

        // Sort by value descending, then label ascending for stable ties.
        pairs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&b.0)));

        Series {
            labels: pairs.iter().map(|(l, _)| l.clone()).collect(),
            values: pairs.iter().map(|(_, v)| *v).collect(),
        }
    }
}

fn combine(vals: &[f64], agg: Agg) -> f64 {
    if vals.is_empty() {
        return 0.0;
    }
    match agg {
        Agg::Count => vals.len() as f64,
        Agg::Sum => vals.iter().sum(),
        Agg::Avg => vals.iter().sum::<f64>() / vals.len() as f64,
        Agg::Min => vals.iter().cloned().fold(f64::INFINITY, f64::min),
        Agg::Max => vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
    }
}

/// Minimal RFC-4180 CSV reader (quoted fields, escaped quotes, commas/newlines inside quotes).
fn parse_csv(input: &str) -> Vec<Vec<String>> {
    let mut records = Vec::new();
    let mut record: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    field.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                field.push(c);
            }
        } else {
            match c {
                '"' => in_quotes = true,
                ',' => record.push(std::mem::take(&mut field)),
                '\n' => {
                    record.push(std::mem::take(&mut field));
                    records.push(std::mem::take(&mut record));
                }
                '\r' => {}
                _ => field.push(c),
            }
        }
    }
    if !field.is_empty() || !record.is_empty() {
        record.push(field);
        records.push(record);
    }
    records
}

#[cfg(test)]
mod tests {
    use super::*;

    const CSV: &str = "region,product,units,revenue\nEU,A,10,100\nEU,B,5,80\nUS,A,20,300\nUS,B,7,90\nEU,A,3,30";

    fn t() -> Table {
        Table::from_csv(CSV)
    }

    #[test]
    fn infers_numeric_columns() {
        let t = t();
        assert_eq!(t.kinds, [ColKind::Text, ColKind::Text, ColKind::Number, ColKind::Number]);
        assert_eq!(t.numeric_cols(), [2, 3]);
        assert_eq!(t.nrows(), 5);
    }

    #[test]
    fn count_by_region() {
        let s = t().aggregate(0, None, Agg::Count);
        // EU has 3 rows, US has 2 → sorted by value desc
        assert_eq!(s.labels, ["EU", "US"]);
        assert_eq!(s.values, [3.0, 2.0]);
    }

    #[test]
    fn sum_revenue_by_region() {
        let s = t().aggregate(0, Some(3), Agg::Sum);
        // US: 300+90=390, EU: 100+80+30=210
        assert_eq!(s.labels, ["US", "EU"]);
        assert_eq!(s.values, [390.0, 210.0]);
    }

    #[test]
    fn avg_min_max_units_by_product() {
        let avg = t().aggregate(1, Some(2), Agg::Avg);
        // A: (10+20+3)/3=11, B: (5+7)/2=6 → A first
        assert_eq!(avg.labels, ["A", "B"]);
        assert_eq!(avg.values, [11.0, 6.0]);

        let max = t().aggregate(1, Some(2), Agg::Max);
        assert_eq!(max.values, [20.0, 7.0]);
        let min = t().aggregate(1, Some(2), Agg::Min);
        assert_eq!(min.labels, ["B", "A"]); // B min=5, A min=3 → 5 first (desc)
        assert_eq!(min.values, [5.0, 3.0]);
    }

    #[test]
    fn empty_and_nonnumeric_measure_cells_are_skipped() {
        let csv = "k,v\na,1\na,\na,x\nb,4";
        let t = Table::from_csv(csv);
        // v column has "x" → Text, but Sum still parses the numeric cells it can
        let s = t.aggregate(0, Some(1), Agg::Sum);
        // a: 1 (only "1" parses; "" and "x" skipped), b: 4
        assert_eq!(s.labels, ["b", "a"]);
        assert_eq!(s.values, [4.0, 1.0]);
    }
}
