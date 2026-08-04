import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { PersonDetailView } from "@/components/people/PersonDetailView";
import {
  getPersonWithPhotos,
  listPeopleWithCovers,
  serializePersonDetail,
  serializePersonListItem,
} from "@/lib/people/queries";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PersonDetailPage({ params }: PageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const { id } = await params;
  if (!id?.trim()) notFound();

  const [person, allPeople] = await Promise.all([
    getPersonWithPhotos(id, userId),
    listPeopleWithCovers(userId),
  ]);

  if (!person) notFound();

  const mergeCandidates = allPeople
    .filter((p) => p.id !== person.id)
    .map(serializePersonListItem);

  const labelPeople = allPeople.map(serializePersonListItem);

  return (
    <PersonDetailView
      initialPerson={serializePersonDetail(person)}
      mergeCandidates={mergeCandidates}
      allPeople={labelPeople}
    />
  );
}
