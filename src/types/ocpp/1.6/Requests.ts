import OCPPError from '../../../charging-station/OcppError';

export default interface Requests {
  [id: string]: [(payload?, requestPayload?) => void, (error?: OCPPError) => void, object];
}
