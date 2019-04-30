import { GetMatched } from '../models';
import { Controller } from './BaseController';

export const GetMatchedController = Controller<GetMatched>(GetMatched);
export type GetMatchedController = InstanceType<typeof GetMatchedController>;
