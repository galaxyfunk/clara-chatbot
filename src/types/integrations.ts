export interface HubSpotContactPayload {
  email: string;
  firstname?: string;
  lastname?: string;
  company?: string;
  lead_source?: string;
  lifecyclestage?: string;
  clara_chat_summary?: string;
  clara_session_url?: string;
}
