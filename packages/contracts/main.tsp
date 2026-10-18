import "@typespec/http";
import "@typespec/openapi3";
using TypeSpec.Http;
@service(#{title: "Pillxai Dispenser API"})
@route("/api")
namespace Pillxa;
union Slot {"morning", "noon", "evening", "bedtime"}
union Meal {"before", "after", "with", "none"}
union Role {"platform", "admin", "staff"}
union Permission {"residents", "prescriptions", "parameters", "export", "devices"}
union Form {"whole", "half"}
model Settings {version:int32; timezone:string; days:int32; startMode:"today"|"tomorrow"; reminderDays:int32; mealSplit:boolean; rows:Slot[];}
model Institution {id:string; name:string; settings:Settings;}
model User {id:string; username:string; name:string; role:Role; institutionId:string|null; permissions:Permission[]; active:boolean;}
model Resident {id:string; institutionId:string; name:string; bed:string; active:boolean; photo:string|null; rfid:string[]; version:int32;}
model Parameters {version:int32; motor:float64; gate:float64; learning:boolean; needsCalibration:boolean;}
model Doses {morning:float64; noon:float64; evening:float64; bedtime:float64;}
model Prescription {id:string; institutionId:string; residentId:string; version:int32; name:string; specification:string; unit:string; image:string|null; form:Form; doses:Doses; meal:Meal; startDate:string; endDate:string|null; active:boolean; parameters:Parameters;}
model Batch {id:string; prescriptionId:string; prescriptionVersion:int32; name:string; specification:string; image:string|null; form:Form; tray:int32; meal:Meal; matrix:int32[][]; target:int32; originalTablets:float64; parameters:Parameters;}
model Tray {number:int32; label:string;}
model Plan {id:string; institutionId:string; residentId:string; resident:{name:string;bed:string;}; settings:Settings; settingsVersion:int32; startDate:string; endDate:string; dates:string[]; rows:Slot[]; mealSplit:boolean; trays:Tray[]; batches:Batch[]; totalParticles:int32; sourceVersions:Record<int32>; createdAt:string;}
model BatchResult {batchId:string; status:"machine"|"manual"|"skipped"|"unknown"; count:int32; reason?:string;}
model Task {id:string; institutionId:string; residentId:string; plan:Plan; executionMode:"serial"|"simulator"; deviceId:string; terminalId:string; userId:string; status:string; started:boolean; results:BatchResult[]; createdAt:string; endedAt:string|null; revision:int32;}
model RuntimeEvent {id:string; sequence:int32; taskId:string; institutionId:string; terminalId:string; deviceId:string; type:string; data:unknown; receivedAt:string;}
union ExecutionPhase {"ready","running","paused","next_drug","tray_change","review","take_out","ended","interrupted","resolving","discarding"}
model ContinueInterruptedInput {taskId:string; batchId:string; progressRetained:boolean;}
model DiscardExecutionInput {taskId:string; confirmed:boolean;}
model PendingResolution {batchId:string; status:"manual"|"skipped"|"unknown"; reason:string; step:"waiting_stop_ack"|"waiting_exit_ack"|"waiting_exit_done";}
model BoxObservation {residentId:string|null; raw:string;}
model GateSettingInput {taskId:string; batchId:string; value:float64;}
model ExecutionSnapshot {taskId:string; plan:Plan; phase:ExecutionPhase; batchIndex:int32; count:int32; results:BatchResult[]; identifiedResidentId:string|null; boxPrepared:boolean; identificationIssue:string|null; identificationSources:Record<BoxObservation>; gateOverrides:Record<float64>; gateValue:float64|null; pendingResolution:PendingResolution|null; hasStarted:boolean; connected:boolean; mode:"simulator"|"serial"; sequence:int32; pendingSync:int32; error:string|null; deviceId:string; terminalId:string; lastUpdated:string;}
model Problem {@statusCode status:400|401|403|404|409|500; code:string; message:string;}
model AuthHeaders {@header authorization:string; @header("x-institution-id") institution:string;}
@route("/workspace") @get op workspace(...AuthHeaders):{institution:Institution; residents:Resident[]; prescriptions:Prescription[]; tasks:Task[];}|Problem;
@route("/login") @post op login(@body credentials:{username:string;password:string;}):{token:string;user:User;}|Problem;
@route("/me") @get op me(@header authorization:string):{user:User;}|Problem;
@route("/institutions") @get op institutions(@header authorization:string):Institution[]|Problem;
@route("/residents") @post op createResident(...AuthHeaders,@body resident:ResidentInput):Resident|Problem;
model PrescriptionInput {residentId?:string; version?:int32; name:string; specification:string; unit?:string; form:Form; doses:Doses; meal:Meal; startDate:string; endDate?:string|null; active?:boolean; image?:string|null;}
@route("/prescriptions") @post op createPrescription(...AuthHeaders,@body prescription:PrescriptionInput):Prescription|Problem;
@route("/plans/preview") @post op preview(...AuthHeaders,@body input:{residentId:string;mealSplit?:boolean;}):{plan:Plan|null;}|Problem;
@route("/tasks/claim") @post op claim(...AuthHeaders,@body input:{residentId:string;planId:string;mealSplit:boolean;executionMode:"serial"|"simulator";deviceId:string;terminalId:string;}):Task|Problem;
@route("/tasks/{id}/begin") @post op begin(...AuthHeaders,@path id:string,@body input:{terminalId:string;}):Task|Problem;
@route("/tasks/{id}/sync") @post op sync(...AuthHeaders,@path id:string,@body input:{terminalId:string;events:RuntimeEvent[];}):{accepted:string[];task:Task;}|Problem;
@route("/health") @get op health():{ok:boolean;version:string;storage:string;};
@route("/setup") @get op setupStatus():{required:boolean;};
@route("/setup") @post op bootstrap(@body input:{username:string;name:string;password:string;}):void|Problem;
@route("/logout") @post op logout(@header authorization:string):void|Problem;
@route("/institutions") @post op createInstitution(@header authorization:string,@body input:{name:string;}):Institution|Problem;
model UserInput {username?:string;name:string;password?:string;role?:Role;permissions?:Permission[];active?:boolean;}
@route("/users") @get op users(...AuthHeaders):User[]|Problem;
@route("/users") @post op createUser(...AuthHeaders,@body input:UserInput):User|Problem;
@route("/users/{id}") @put op updateUser(...AuthHeaders,@path id:string,@body input:UserInput):User|Problem;
model ResidentInput {name:string;bed?:string;active?:boolean;rfid?:string[];photo?:string|null;version?:int32;}
@route("/residents/{id}") @put op updateResident(...AuthHeaders,@path id:string,@body input:ResidentInput):Resident|Problem;
@route("/prescriptions/{id}") @put op updatePrescription(...AuthHeaders,@path id:string,@body input:PrescriptionInput):Prescription|Problem;
@route("/prescriptions/{id}/parameters") @put op parameters(...AuthHeaders,@path id:string,@body input:{version:int32;motor:float64;gate:float64;learning:boolean;}):Parameters|Problem;
@route("/settings") @put op settings(...AuthHeaders,@body input:Settings):Institution|Problem;
@route("/tasks/{id}/cancel") @post op cancel(...AuthHeaders,@path id:string,@body input:{terminalId:string;}):Task|Problem;
@route("/tasks/{id}/discard") @post op discard(...AuthHeaders,@path id:string,@body input:{terminalId:string;confirmed:boolean;}):{ok:boolean;}|Problem;
@route("/tasks/{id}/events") @get op events(...AuthHeaders,@path id:string):RuntimeEvent[]|Problem;
model RecordFilters {@query q?:string; @query residentId?:string; @query dateFrom?:string; @query dateTo?:string; @query result?:"complete"|"attention"|"active"|"cancelled"; @query mode?:"serial"|"simulator"; @query device?:string; @query operator?:string; @query drug?:string; @query sort?:"newest"|"oldest";}
@route("/records") @get op records(...AuthHeaders,...RecordFilters,@query before?:string):{items:Task[];nextCursor?:string;filters:RecordFilters;}|Problem;
@route("/records/export") @get op exportRecords(...AuthHeaders,...RecordFilters):{exportedAt:string;institutionId:string;fieldNote:string;tasks:Task[];}|Problem;
model PlanningQueueItem {resident:Resident; coverageEnd:string|null; startDate:string|null; endDate:string|null; drugCount:int32; reason:string; due:boolean; occupiedTaskId:string|null; deviceName:string|null; issue:string|null;}
@route("/planning/queue") @get op planningQueue(...AuthHeaders):{today:string;items:PlanningQueueItem[];}|Problem;
@route("/tasks/{id}/samples/export") @get op exportSamples(...AuthHeaders,@path id:string):{institutionId:string;events:RuntimeEvent[];}|Problem;
@route("/labels") @post op labels(...AuthHeaders,@body input:{residentIds:string[];copies:int32;}):{@header contentType:"application/pdf";@body file:bytes;}|Problem;
@route("/releases/latest") @get op release(@header authorization:string):{available:boolean;message:string;version:string;}|Problem;
@route("/demo") @post op demo(...AuthHeaders):{ok:boolean;}|Problem;
