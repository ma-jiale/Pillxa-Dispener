// Explicit composition root. Feature modules call only injected public services.
import type { Database } from "./database.ts";
export { ApiError } from "./core.ts";
export type { Context } from "./core.ts";
import { Identity } from "./modules/identity.ts";
import { Residents } from "./modules/residents.ts";
import { Medication } from "./modules/medication.ts";
import { Records } from "./modules/records.ts";
import { Planning } from "./modules/planning.ts";
import { Dispensing } from "./modules/dispensing.ts";
export function createBusiness(db: Database) {
  const identity = new Identity(db);
  const residents = new Residents(db, identity);
  const medication = new Medication(db, identity, residents);
  const records = new Records(db);
  const planning = new Planning(db, residents, medication, records);
  const dispensing = new Dispensing(db, identity, records, planning);
  return {
    setupRequired: identity.setupRequired.bind(identity),
    bootstrap: identity.bootstrap.bind(identity),
    login: identity.login.bind(identity),
    authenticate: identity.authenticate.bind(identity),
    logout: identity.logout.bind(identity),
    context: identity.context.bind(identity),
    require: identity.require.bind(identity),
    admin: identity.admin.bind(identity),
    institutions: identity.institutions.bind(identity),
    createInstitution: identity.createInstitution.bind(identity),
    institution: identity.institution.bind(identity),
    audit: identity.audit.bind(identity),
    users: identity.users.bind(identity),
    saveUser: identity.saveUser.bind(identity),
    settings: identity.settings.bind(identity),
    residents: residents.residents.bind(residents),
    resident: residents.resident.bind(residents),
    saveResident: residents.saveResident.bind(residents),
    prescriptions: medication.prescriptions.bind(medication),
    savePrescription: medication.savePrescription.bind(medication),
    parameters: medication.parameters.bind(medication),
    tasks: records.tasks.bind(records),
    recordPage: records.recordPage.bind(records),
    task: records.task.bind(records),
    events: records.events.bind(records),
    preview: planning.preview.bind(planning),
    planningQueue: planning.queue.bind(planning),
    claim: dispensing.claim.bind(dispensing),
    begin: dispensing.begin.bind(dispensing),
    cancel: dispensing.cancel.bind(dispensing),
    discard: dispensing.discard.bind(dispensing),
    sync: dispensing.sync.bind(dispensing),
  };
}
