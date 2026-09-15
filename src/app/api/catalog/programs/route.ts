import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listPrograms } from "@/lib/catalog/queries";
import type { Database } from "@/types/supabase";

const PROGRAM_TYPES: ReadonlySet<Database["public"]["Enums"]["program_type"]> =
  new Set(["major", "minor", "immersion", "option", "concentration", "combined"]);

type ProgramType = Database["public"]["Enums"]["program_type"];

function isProgramType(value: string): value is ProgramType {
  return PROGRAM_TYPES.has(value as ProgramType);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const typeParam = request.nextUrl.searchParams.get("type");
  let type: ProgramType | undefined;
  if (typeParam !== null) {
    if (!isProgramType(typeParam)) {
      return NextResponse.json(
        { error: `Invalid type "${typeParam}"` },
        { status: 400 },
      );
    }
    type = typeParam;
  }

  const programs = await listPrograms(supabase, type ? { type } : undefined);
  return NextResponse.json({ programs });
}
