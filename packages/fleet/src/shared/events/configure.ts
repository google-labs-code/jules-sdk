// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/** Configure domain events */
export type ConfigureEvent =
  | { type: 'configure:start'; resource: string; owner: string; repo: string }
  | { type: 'configure:label:created'; name: string }
  | { type: 'configure:label:exists'; name: string }
  | { type: 'configure:secret:uploading'; name: string }
  | { type: 'configure:secret:uploaded'; name: string }
  | { type: 'configure:done' };
