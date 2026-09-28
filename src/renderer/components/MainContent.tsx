import { WelcomeScreen } from './WelcomeScreen'
import { useProjectStore } from '../stores/useProjectStore'
import { DataWorkspace } from './data-workspace'
import { AnalysisWorkspace } from './analysis-workspace'
import { shouldShowDataWorkspace } from './main-content-utils'

export function MainContent() {
  const files = useProjectStore(s => s.files)
  const appMode = useProjectStore(s => s.appMode)
  const activeView = useProjectStore(s => s.activeView)

  const hasFiles = files.length > 0

  if (!hasFiles) {
    return <WelcomeScreen />
  }

  if (shouldShowDataWorkspace(appMode, activeView)) {
    return <DataWorkspace />
  }

  return <AnalysisWorkspace />
}
