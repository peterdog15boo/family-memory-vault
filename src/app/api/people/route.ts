import { NextResponse } from "next/server";
import {
  peopleApiErrorResponse,
  requirePeopleApiUser,
} from "@/lib/people/http";
import {
  listPeopleWithCovers,
  serializePersonListItem,
} from "@/lib/people/queries";

/**
 * GET /api/people — list the signed-in user's people (covers + photo counts).
 */
export async function GET() {
  const authResult = await requirePeopleApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    const people = await listPeopleWithCovers(authResult.userId);
    return NextResponse.json({
      people: people.map(serializePersonListItem),
    });
  } catch (error) {
    return peopleApiErrorResponse(error, "Failed to list people");
  }
}
