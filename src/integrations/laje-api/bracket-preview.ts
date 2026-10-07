import type {
  ChampionshipBracketPreviewDay,
  ChampionshipBracketPreviewJob,
  ChampionshipBracketSetupFormValues,
} from "@/domain/championship-brackets/championshipBracket.types";
import { lajeApiRequest } from "./client";

interface DataResponse<T> {
  data: T;
}

export async function startAwsBracketPreviewJob(
  championshipId: string,
  payload: ChampionshipBracketSetupFormValues,
): Promise<ChampionshipBracketPreviewJob> {
  const response = await lajeApiRequest<DataResponse<ChampionshipBracketPreviewJob>>(
    `/championships/${championshipId}/bracket/preview-jobs`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return response.data;
}

export async function getAwsBracketPreviewJob(
  championshipId: string,
  jobId: string,
): Promise<ChampionshipBracketPreviewJob> {
  const response = await lajeApiRequest<DataResponse<ChampionshipBracketPreviewJob>>(
    `/championships/${championshipId}/bracket/preview-jobs/${jobId}`,
  );
  return response.data;
}

export async function getAwsBracketPreviewJobDay(
  championshipId: string,
  jobId: string,
  date: string,
): Promise<ChampionshipBracketPreviewDay | null> {
  const response = await lajeApiRequest<DataResponse<ChampionshipBracketPreviewDay | null>>(
    `/championships/${championshipId}/bracket/preview-jobs/${jobId}/days/${date}`,
  );
  return response.data;
}

export async function cancelAwsBracketPreviewJob(
  championshipId: string,
  jobId: string,
): Promise<ChampionshipBracketPreviewJob> {
  const response = await lajeApiRequest<DataResponse<ChampionshipBracketPreviewJob>>(
    `/championships/${championshipId}/bracket/preview-jobs/${jobId}/cancel`,
    { method: "POST" },
  );
  return response.data;
}
