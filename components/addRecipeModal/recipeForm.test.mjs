import assert from "node:assert/strict";
import test from "node:test";
import { createRecipeFormData } from "./recipeForm.ts";

test("recipe form creates canonical defaults and preserves edit data", () => {
  assert.equal(createRecipeFormData(null, "https://example.com").category, "Sonstiges");
  assert.equal(createRecipeFormData(null, "https://example.com").sourceImageUrl, "https://example.com");

  const form = createRecipeFormData({
    title: "Pasta",
    category: "Pasta",
    prepTimeMinutes: 20,
    difficulty: "Einfach",
    portions: 2,
    ingredients: [],
    instructions: [],
  });
  assert.deepEqual(form.ingredients, [{ name: "", amount: "" }]);
  assert.deepEqual(form.instructions, [{ text: "" }]);
});
