//! Rebuild the two portable FLUX demo families from the shipped catalogue.
fn main() -> project_core::Result<()> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/flux3");
    let all = workflow_core::examples::catalogue()?;
    for (suffix, name) in [("200", "flux3-t2i"), ("210", "flux3-i2i-2ref")] {
        let workflows: Vec<_> = all
            .iter()
            .filter(|w| w.wrapper.family_id.ends_with(suffix))
            .cloned()
            .collect();
        workflow_core::bundle::write_file(
            &root.join(format!("{name}.mymovie-workflow")),
            &workflows,
        )?;
    }
    Ok(())
}
