/** Lọc cây cấu trúc công ty theo Khối hoặc Công ty. */

export function flattenEcosystemTree(nodes, out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const node of nodes) {
    out.push(node);
    if (node.children?.length) flattenEcosystemTree(node.children, out);
  }
  return out;
}

export function isDivisionUnit(node) {
  const depth = node?.level?.depth;
  const slug = node?.level?.slug;
  return depth === 1 || slug === 'division' || slug === 'khoi' || slug === 'block';
}

export function isCompanyUnit(node) {
  const depth = node?.level?.depth;
  const slug = node?.level?.slug;
  return depth === 2 || slug === 'subsidiary' || slug === 'company' || Boolean(node?.company_id);
}

export function findEcosystemNode(tree, id) {
  if (!id) return null;
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findEcosystemNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function buildBranchFilterOptions(tree) {
  const all = flattenEcosystemTree(tree);
  const byId = Object.fromEntries(all.map((n) => [n.id, n]));

  const divisions = all.filter(isDivisionUnit).map((node) => ({
    id: node.id,
    name: node.name,
    shortName: node.short_name,
  }));

  const companies = all.filter(isCompanyUnit).map((node) => {
    const parent = node.parent_id ? byId[node.parent_id] : null;
    const parentLabel = parent?.short_name || parent?.name;
    const suffix = parentLabel && !node.name.includes(parentLabel) ? ` · ${parentLabel}` : '';
    return {
      id: node.id,
      name: `${node.name}${suffix}`,
    };
  });

  return { divisions, companies };
}

export function filterEcosystemTreeByBranch(tree, branchId) {
  if (!branchId || branchId === 'all') return tree;
  const node = findEcosystemNode(tree, branchId);
  if (!node) return tree;
  return [{ ...node, children: node.children ? [...node.children] : [] }];
}
