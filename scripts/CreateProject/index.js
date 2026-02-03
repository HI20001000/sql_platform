export { getConnection } from './dbClient.js'
export { createProject, fetchProjects } from './projects.js'
export { createProduct, fetchProducts } from './products.js'
export { createTask, fetchTasksWithParents } from './tasks.js'
export { fetchTaskStepsByTaskId } from './taskSteps.js'
export {
  buildProjectTreeRows,
  createProjectNode,
  createProductNode,
  createTaskNode,
} from './treeService.js'
