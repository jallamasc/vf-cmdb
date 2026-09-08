import { describe, it, expect } from "vitest";
import {
  familyForVersion,
  familyLabelByVersionId,
  compareVersionsDesc,
  latestNPerFamily,
} from "./osVersionGrouping";

const FAMILIES = [
  { id: 1, full_name: "Ubuntu", abbreviation: "ubuntu" },
  { id: 2, full_name: "CentOS", abbreviation: "centos" },
  { id: 3, full_name: "CentOS Stream", abbreviation: "centos-stream" },
];

function v(id: number, abbreviation: string, full_name: string) {
  return { id, abbreviation, full_name };
}

describe("familyForVersion", () => {
  it("matches a version to its family by abbreviation prefix", () => {
    expect(familyForVersion(v(1, "ubuntu-2404", "Ubuntu 24.04"), FAMILIES)?.full_name).toBe(
      "Ubuntu"
    );
  });

  it("prefers the LONGEST matching family prefix (centos-stream over centos)", () => {
    expect(
      familyForVersion(v(2, "centos-stream-9", "CentOS Stream 9"), FAMILIES)?.full_name
    ).toBe("CentOS Stream");
    expect(familyForVersion(v(3, "centos-9", "CentOS 9"), FAMILIES)?.full_name).toBe("CentOS");
  });

  it("returns null when nothing matches", () => {
    expect(familyForVersion(v(4, "freebsd-14", "FreeBSD 14"), FAMILIES)).toBeNull();
  });
});

describe("familyLabelByVersionId", () => {
  it("labels an unmatched version as 'Other / ungrouped'", () => {
    const map = familyLabelByVersionId([v(4, "freebsd-14", "FreeBSD 14")], FAMILIES);
    expect(map.get(4)).toBe("Other / ungrouped");
  });

  it("labels a matched version with its family's full_name", () => {
    const map = familyLabelByVersionId([v(1, "ubuntu-2404", "Ubuntu 24.04")], FAMILIES);
    expect(map.get(1)).toBe("Ubuntu");
  });
});

describe("compareVersionsDesc", () => {
  it("sorts dotted versions newest-first", () => {
    const rows = [
      v(1, "ubuntu-2004", "Ubuntu 20.04"),
      v(2, "ubuntu-2404", "Ubuntu 24.04"),
      v(3, "ubuntu-2204", "Ubuntu 22.04"),
    ];
    const sorted = [...rows].sort(compareVersionsDesc);
    expect(sorted.map((r) => r.full_name)).toEqual([
      "Ubuntu 24.04",
      "Ubuntu 22.04",
      "Ubuntu 20.04",
    ]);
  });

  it("sorts bare-number versions newest-first", () => {
    const rows = [v(1, "rhel-8", "RHEL 8"), v(2, "rhel-9", "RHEL 9")];
    const sorted = [...rows].sort(compareVersionsDesc);
    expect(sorted.map((r) => r.full_name)).toEqual(["RHEL 9", "RHEL 8"]);
  });
});

describe("latestNPerFamily", () => {
  it("keeps only the latest N versions per family", () => {
    const versions = [
      v(1, "ubuntu-1404", "Ubuntu 14.04"),
      v(2, "ubuntu-1604", "Ubuntu 16.04"),
      v(3, "ubuntu-1804", "Ubuntu 18.04"),
      v(4, "ubuntu-2004", "Ubuntu 20.04"),
      v(5, "ubuntu-2204", "Ubuntu 22.04"),
      v(6, "ubuntu-2404", "Ubuntu 24.04"),
    ];
    const kept = latestNPerFamily(versions, FAMILIES, 4);
    expect(kept).toEqual(new Set([3, 4, 5, 6]));
  });

  it("ranks each family independently", () => {
    const versions = [
      v(1, "ubuntu-2404", "Ubuntu 24.04"),
      v(2, "centos-9", "CentOS 9"),
      v(3, "centos-8", "CentOS 8"),
    ];
    const kept = latestNPerFamily(versions, FAMILIES, 4);
    expect(kept).toEqual(new Set([1, 2, 3]));
  });

  it("always keeps ungrouped versions (nothing to rank them against)", () => {
    const versions = [v(1, "freebsd-14", "FreeBSD 14"), v(2, "freebsd-13", "FreeBSD 13")];
    const kept = latestNPerFamily(versions, FAMILIES, 4);
    expect(kept).toEqual(new Set([1, 2]));
  });
});
