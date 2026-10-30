import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { getQuery, readBody } from "h3";
import { beforeEach, describe, expect, test } from "vitest";
import SharedInputTag from "../../components/SharedInputTag.vue";
import { emptyPortalCapabilities } from "../../shared/permissions";
import type { TagView } from "../../shared/contracts";

const catalog = new Map<string, TagView>();
const searchQueries: string[] = [];

registerEndpoint("/api/me", () => ({
  user: { id: "00000000-0000-4000-8000-000000000001", name: "Tester", image: null },
  capabilities: {
    ...emptyPortalCapabilities,
    tagsRead: true,
    tagsCreate: true,
    tagsDelete: true,
  },
  status: 200,
  code: 200,
}));

registerEndpoint("/api/tags", {
  method: "GET",
  handler: async (event) => {
    const query = getQuery(event);
    const q = typeof query.q === "string" ? query.q : "";
    if (q) searchQueries.push(q);
    if (q === "slow") await new Promise((resolve) => setTimeout(resolve, 50));
    if (q === "fast") await new Promise((resolve) => setTimeout(resolve, 2));
    const names = Array.isArray(query.name)
      ? query.name.map(String)
      : typeof query.name === "string"
        ? [query.name]
        : [];
    const tags = [...catalog.values()].filter((tag) =>
      q ? tag.name.includes(q) : names.includes(tag.name),
    );
    return { tags, hasMore: false, status: 200, code: 200 };
  },
});

registerEndpoint("/api/tags", {
  method: "POST",
  handler: async (event) => {
    const body = await readBody<TagView>(event);
    catalog.set(body.name, body);
    return { tag: body, status: 201, code: 201 };
  },
});

beforeEach(() => {
  catalog.clear();
  searchQueries.length = 0;
  document.body.innerHTML = "";
});

async function waitForSearch(milliseconds = 30) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
  await flushPromises();
}

describe("SharedInputTag", () => {
  test("debounces search, shows colored matches, and selects from the catalog", async () => {
    catalog.set("devops", { name: "devops", color: "purple" });
    const wrapper = await mountSuspended(SharedInputTag, {
      props: { modelValue: [], debounceMs: 10 },
      attachTo: document.body,
    });
    const input = wrapper.get("input");
    await input.setValue("dev");
    expect(searchQueries).toEqual([]);
    await waitForSearch();

    expect(searchQueries).toEqual(["dev"]);
    expect(document.body.textContent).toContain("devops");
    const swatch = document.querySelector<HTMLElement>(
      ".shared-input-tag__option .shared-input-tag__color",
    );
    expect(swatch?.style.backgroundColor).toBe("#8b5cf6");
    document
      .querySelector<HTMLElement>(".shared-input-tag__option")
      ?.click();
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([["devops"]]);
  });

  test("does not insert unknown input and creates without auto-selecting", async () => {
    const wrapper = await mountSuspended(SharedInputTag, {
      props: { modelValue: [], debounceMs: 5 },
      attachTo: document.body,
    });
    const input = wrapper.get("input");
    await input.setValue("newtag");
    await waitForSearch();
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    document
      .querySelector<HTMLButtonElement>(".shared-input-tag__create .el-button")
      ?.click();
    await waitForSearch();
    expect(catalog.get("newtag")?.color).toBe("blue");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(document.body.textContent).toContain("newtag");
  });

  test("ignores stale searches and keeps the menu at its fixed dimensions", async () => {
    catalog.set("slow-result", { name: "slow-result", color: "red" });
    catalog.set("fast-result", { name: "fast-result", color: "green" });
    const wrapper = await mountSuspended(SharedInputTag, {
      props: { modelValue: [], debounceMs: 1 },
      attachTo: document.body,
    });
    const input = wrapper.get("input");
    await input.setValue("slow");
    await waitForSearch(5);
    await input.setValue("fast");
    await waitForSearch(70);

    expect(document.body.textContent).toContain("fast-result");
    expect(document.body.textContent).not.toContain("slow-result");
    const menu = document.querySelector<HTMLElement>(".shared-input-tag__menu");
    expect(menu?.style.height).toBe("280px");
    const popper = document.querySelector<HTMLElement>(".shared-input-tag-popper");
    expect(popper?.style.width).toBe("360px");
  });
});
