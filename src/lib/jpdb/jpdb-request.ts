import { getConfigurationValue } from '@lib/configuration/get-configuration-value';
import { JPDBRequestOptions } from './jpdb.types';

export const jpdbRequest = async <TResult extends object>(
  action: string,
  params: any,
  options?: JPDBRequestOptions,
): Promise<TResult> => {
  const apiToken = options?.apiToken || (await getConfigurationValue('apiToken'));

  if (!apiToken) {
    throw new Error('API Token is not set');
  }

  const usedUrl = new URL(`https://jpdb.io/api/v1/${action}`);
  const response = await fetch(usedUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
      Accept: 'application/json',
    },
    body: params ? JSON.stringify(params) : undefined,
  });

  const responseObject = (await response.json()) as
    | {
        error_message: string;
      }
    | TResult;

  if ('error_message' in responseObject) {
    throw new Error(responseObject.error_message);
  }

  return responseObject;
};
