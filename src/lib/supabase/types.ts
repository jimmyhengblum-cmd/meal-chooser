export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Mirrors the source's schema.org HowToStep/HowToSection structure, flattened
// to display order. `section` is null for steps that aren't grouped under a
// named section in the source recipe.
export interface RecipeInstructionStep {
  section: string | null;
  text: string;
}

// Set by scripts/scrape/classify-pending.ts; null until classified.
export type DishType =
  | "plat"
  | "entree"
  | "dessert"
  | "sauce_condiment"
  | "boisson"
  | "autre";

export interface Database {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Tables: {
      recipes: {
        Row: {
          id: string;
          source_site: string;
          source_url: string;
          title: string;
          title_fr: string | null;
          description: string | null;
          description_fr: string | null;
          author: string | null;
          image_path: string | null;
          servings: string | null;
          prep_minutes: number | null;
          cook_minutes: number | null;
          total_minutes: number | null;
          instructions: RecipeInstructionStep[];
          instructions_fr: RecipeInstructionStep[] | null;
          dish_type: DishType | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_site: string;
          source_url: string;
          title: string;
          title_fr?: string | null;
          description?: string | null;
          description_fr?: string | null;
          author?: string | null;
          image_path?: string | null;
          servings?: string | null;
          prep_minutes?: number | null;
          cook_minutes?: number | null;
          total_minutes?: number | null;
          instructions?: RecipeInstructionStep[];
          instructions_fr?: RecipeInstructionStep[] | null;
          dish_type?: DishType | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_site?: string;
          source_url?: string;
          title?: string;
          title_fr?: string | null;
          description?: string | null;
          description_fr?: string | null;
          author?: string | null;
          image_path?: string | null;
          servings?: string | null;
          prep_minutes?: number | null;
          cook_minutes?: number | null;
          total_minutes?: number | null;
          instructions?: RecipeInstructionStep[];
          instructions_fr?: RecipeInstructionStep[] | null;
          dish_type?: DishType | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ingredients: {
        Row: {
          id: string;
          name: string;
          name_fr: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          name_fr?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          name_fr?: string | null;
        };
        Relationships: [];
      };
      recipe_ingredients: {
        Row: {
          id: string;
          recipe_id: string;
          ingredient_id: string;
          raw_text: string;
          quantity: number | null;
          unit: string | null;
          note: string | null;
          note_fr: string | null;
          display_order: number;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          ingredient_id: string;
          raw_text: string;
          quantity?: number | null;
          unit?: string | null;
          note?: string | null;
          note_fr?: string | null;
          display_order?: number;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          ingredient_id?: string;
          raw_text?: string;
          quantity?: number | null;
          unit?: string | null;
          note?: string | null;
          note_fr?: string | null;
          display_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_plan_entries: {
        Row: {
          id: string;
          user_id: string;
          recipe_id: string;
          planned_date: string;
          meal_slot: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          recipe_id: string;
          planned_date: string;
          meal_slot?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          recipe_id?: string;
          planned_date?: string;
          meal_slot?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      grocery_list_items: {
        Row: {
          id: string;
          user_id: string;
          ingredient_id: string;
          quantity: number | null;
          unit: string | null;
          checked: boolean;
          source_recipe_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ingredient_id: string;
          quantity?: number | null;
          unit?: string | null;
          checked?: boolean;
          source_recipe_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          ingredient_id?: string;
          quantity?: number | null;
          unit?: string | null;
          checked?: boolean;
          source_recipe_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grocery_list_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grocery_list_items_source_recipe_id_fkey";
            columns: ["source_recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
  };
}
