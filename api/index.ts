import serverless from 'serverless-http';
import { createApp } from '../src/app';
export default serverless(createApp());
