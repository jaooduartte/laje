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
  jobId: string,
): Promise<ChampionshipBracketPreviewJob> {
  const response = await lajeApiRequest<DataResponse<ChampionshipBracketPreviewJob>>(
    `/bracket-preview-jobs/${jobId}`,
  );
  return response.data;
}

export async function getAwsBracketPreviewJobDay(
  jobId: string,
  date: string,
): Promise<ChampionshipBracketPreviewDay | null> {
  const response = await lajeApiRequest<DataResponse<ChampionshipBracketPreviewDay | null>>(
    `/bracket-preview-jobs/${jobId}/days/${date}`,
  );
  return response.data;
}

export async function cancelAwsBracketPreviewJob(
  jobId: string,
): Promise<ChampionshipBracketPreviewJob> {
  const response = await lajeApiRequest<DataResponse<ChampionshipBracketPreviewJob>>(
    `/bracket-preview-jobs/${jobId}/cancel`,
    { method: "POST" },
  );
  return response.data;
}
